import { useState } from "react";
import Icon from "./Icon";
import * as api from "../lib/estudio";
import "./ReferenciasGaleria.css";

/**
 * «Dame ideas» para un carrusel o un reel IA: cuando no hay idea, la IA propone de 3 a 5 con lo que se sabe de la
 * marca; «Usar» la pone en el paso 1 del flujo (el tema y el guion, o la idea central). «Otras» pide más sin repetir
 * las que ya salieron. Es texto: no gasta en el motor.
 */
export default function IdeasDeFormato({ clienteId, formato = "carrusel", preset = "", productoId = "", tema = "", segundos = 10, onUsar }) {
  const [ideas, setIdeas] = useState([]);
  const [usados, setUsados] = useState([]);
  const [pidiendo, setPidiendo] = useState(false);
  const [error, setError] = useState("");
  const reel = formato === "reel";

  const pedir = async () => {
    setPidiendo(true);
    setError("");
    try {
      const r = await api.ideasDeFormato(clienteId, formato, { preset, productoId: productoId || undefined, tema, segundos, n: 4, usados });
      setIdeas(r.ideas ?? []);
      setUsados((u) => [...(r.ideas ?? []).map((i) => i.titulo), ...u].slice(0, 15));
    } catch (e) {
      setError(e.message);
    } finally {
      setPidiendo(false);
      window.dispatchEvent(new Event("ia:gasto"));
    }
  };

  return (
    <div className="ideas-formato">
      <button type="button" className="btn btn-secondary btn-sm" disabled={pidiendo} onClick={pedir}>
        <Icon name="sparkles" size={14} /> {pidiendo ? "Pensando ideas…" : ideas.length ? "Otras ideas" : `Dame ideas de ${reel ? "reel" : "carrusel"}`}
      </button>
      {error && <p role="alert" className="cerebro-error">{error}</p>}
      {ideas.length > 0 && (
        <ul className="ideas-formato-lista">
          {ideas.map((i) => (
            <li key={i.id} className="ideas-formato-item">
              <strong>{i.titulo}</strong>
              <p className="hint" style={{ margin: 0 }}>{reel ? i.idea : i.tema}</p>
              {!reel && i.guion && <p className="ideas-formato-guion">{i.guion}</p>}
              <button type="button" className="btn btn-primary btn-sm" onClick={() => { onUsar(i); setIdeas([]); }}>
                <Icon name="check" size={14} /> Usar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
