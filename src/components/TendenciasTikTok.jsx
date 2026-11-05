import { useId, useState } from "react";
import Icon from "./Icon";
import { guardarTendencias } from "../lib/inspiracionApi";
import { MAX_PALABRAS, palabraDeTendencia } from "../lib/scrapeCreators";
import { haceCuanto } from "../lib/competencia";
import "./CuentasReferencia.css";

// ============================================================
// Las tendencias de TikTok de un cliente: unas palabras o #hashtags de su rubro
//
// Cada semana se buscan en TikTok por Scrape Creators (un crédito por palabra,
// dentro del tope semanal de Ajustes, el mismo de los anuncios y las cuentas de
// TikTok) y los videos con más vistas salen en «Lo mejor» como «Tendencia de
// TikTok». Van en su tabla (`tendencias_palabras`), no en la ficha del
// cliente: se guardan aquí, una lista entera cada vez.
// ============================================================

/**
 * @param tendencias  { activas, palabras: [{ id, palabra, leidaAt, error, videos }] } (lo trae el feed de Inspiración).
 * @param sc          si hay llave de Scrape Creators.
 * @param onCambio    (tendencias) → lo guardado, para el feed.
 */
export default function TendenciasTikTok({ clienteId, tendencias, sc = false, lectura = false, onCambio = () => {} }) {
  const ids = useId();
  const palabras = tendencias?.palabras ?? [];
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const llena = palabras.length >= MAX_PALABRAS;

  const guardar = async (lista) => {
    setGuardando(true);
    setError("");
    try { onCambio(await guardarTendencias(clienteId, lista)); } catch (e) { setError(e.message); }
    setGuardando(false);
  };

  const anadir = (e) => {
    e.preventDefault();
    const p = palabraDeTendencia(texto);
    if (!p) { setError("Escribe una palabra (2 letras o más) o un #hashtag."); return; }
    if (palabras.some((x) => x.palabra === p.texto)) { setError(`«${p.texto}» ya está.`); return; }
    if (llena) { setError(`Caben ${MAX_PALABRAS} palabras por cliente: quita una para añadir otra.`); return; }
    setTexto("");
    void guardar([...palabras.map((x) => x.palabra), p.texto]);
  };

  return (
    <div className="cuentas-ref" aria-labelledby={`${ids}-t`} role="group">
      <p id={`${ids}-t`} className="label" style={{ margin: 0 }}><Icon name="trending" size={14} /> Tendencias de TikTok</p>
      <p className="hint" style={{ margin: 0 }}>
        Hasta {MAX_PALABRAS} palabras o #hashtags de su rubro. Cada semana se buscan en TikTok los videos con más vistas (un crédito de
        Scrape Creators por palabra, dentro del tope de Ajustes) y salen en «Lo mejor».
        {!sc && " Hace falta la llave de Scrape Creators (Ajustes → Integraciones)."}
        {sc && tendencias && !tendencias.activas && " Ahora están apagadas en Ajustes → Integraciones → Scrape Creators."}
      </p>
      {!lectura && (
        <form className="cuentas-ref-form" onSubmit={anadir} noValidate>
          <label className="sr-only" htmlFor={`${ids}-p`}>Palabra o #hashtag</label>
          <input id={`${ids}-p`} className="input" value={texto} maxLength={60} autoComplete="off" disabled={llena || guardando}
            placeholder={llena ? `Ya hay ${MAX_PALABRAS} palabras` : "cuna para bebé, #babyshower…"}
            onChange={(e) => { setTexto(e.target.value); setError(""); }} />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!texto.trim() || llena || guardando} aria-busy={guardando || undefined}>
            <Icon name="plus" size={14} /> Añadir
          </button>
        </form>
      )}
      {error && <p role="alert" className="cuentas-ref-error">{error}</p>}
      {palabras.length > 0 && (
        <ul className="cuentas-ref-lista" aria-label="Palabras de tendencia de este cliente">
          {palabras.map((p) => (
            <li key={p.id} className="cuentas-ref-item">
              <span className="cuentas-ref-usuario">{p.palabra}</span>
              <span className="hint" style={{ margin: 0 }}>
                {p.error ? `No se pudo: ${p.error}` : p.leidaAt ? `${p.videos} ${p.videos === 1 ? "video" : "videos"} · ${haceCuanto(p.leidaAt)}` : "Espera su primera búsqueda"}
              </span>
              {!lectura && (
                <button type="button" className="btn-icon" aria-label={`Quitar «${p.palabra}»`} disabled={guardando}
                  onClick={() => guardar(palabras.filter((x) => x.id !== p.id).map((x) => x.palabra))}>
                  <Icon name="close" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
